/**
 * Input Validation Middleware
 *
 * SECURITY FIX #11: Comprehensive input validation to prevent injection attacks
 * and ensure data integrity without external dependencies.
 */

import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from './error-handler';

/**
 * Validation schema types
 */
export type ValidationRule =
  | { type: 'string'; minLength?: number; maxLength?: number; pattern?: RegExp; enum?: string[] }
  | { type: 'number'; min?: number; max?: number; integer?: boolean }
  | { type: 'boolean' }
  | { type: 'array'; items?: ValidationRule; minItems?: number; maxItems?: number }
  | { type: 'object'; properties: Record<string, ValidationField> }
  | { type: 'uuid' }
  | { type: 'email' }
  | { type: 'url' };

export interface ValidationField extends ValidationRule {
  required?: boolean;
  description?: string;
}

export interface ValidationSchema {
  body?: Record<string, ValidationField>;
  query?: Record<string, ValidationField>;
  params?: Record<string, ValidationField>;
}

/**
 * Validation error details
 */
interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * UUID pattern (RFC 4122)
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Email pattern (simplified RFC 5322)
 */
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * URL pattern
 */
const URL_PATTERN = /^https?:\/\/.+/;

/**
 * Validate a value against a rule
 */
function validateValue(
  fieldName: string,
  value: unknown,
  rule: ValidationField
): ValidationError | null {
  // Check required
  if (rule.required && (value === undefined || value === null || value === '')) {
    return {
      field: fieldName,
      message: `${fieldName} is required`,
    };
  }

  // Allow optional undefined/null
  if (!rule.required && (value === undefined || value === null)) {
    return null;
  }

  // Type-specific validation
  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') {
        return {
          field: fieldName,
          message: `${fieldName} must be a string`,
          value,
        };
      }

      // Length validation
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        return {
          field: fieldName,
          message: `${fieldName} must be at least ${rule.minLength} characters`,
          value,
        };
      }

      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        return {
          field: fieldName,
          message: `${fieldName} must be at most ${rule.maxLength} characters`,
          value,
        };
      }

      // Pattern validation
      if (rule.pattern && !rule.pattern.test(value)) {
        return {
          field: fieldName,
          message: `${fieldName} has invalid format`,
          value,
        };
      }

      // Enum validation
      if (rule.enum && !rule.enum.includes(value)) {
        return {
          field: fieldName,
          message: `${fieldName} must be one of: ${rule.enum.join(', ')}`,
          value,
        };
      }
      break;

    case 'number':
      const num = typeof value === 'string' ? parseFloat(value) : value;

      if (typeof num !== 'number' || isNaN(num)) {
        return {
          field: fieldName,
          message: `${fieldName} must be a number`,
          value,
        };
      }

      // Integer check
      if (rule.integer && !Number.isInteger(num)) {
        return {
          field: fieldName,
          message: `${fieldName} must be an integer`,
          value,
        };
      }

      // Range validation
      if (rule.min !== undefined && num < rule.min) {
        return {
          field: fieldName,
          message: `${fieldName} must be at least ${rule.min}`,
          value,
        };
      }

      if (rule.max !== undefined && num > rule.max) {
        return {
          field: fieldName,
          message: `${fieldName} must be at most ${rule.max}`,
          value,
        };
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        // Allow string 'true'/'false'
        if (value !== 'true' && value !== 'false') {
          return {
            field: fieldName,
            message: `${fieldName} must be a boolean`,
            value,
          };
        }
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        return {
          field: fieldName,
          message: `${fieldName} must be an array`,
          value,
        };
      }

      // Items count validation
      if (rule.minItems !== undefined && value.length < rule.minItems) {
        return {
          field: fieldName,
          message: `${fieldName} must have at least ${rule.minItems} items`,
          value,
        };
      }

      if (rule.maxItems !== undefined && value.length > rule.maxItems) {
        return {
          field: fieldName,
          message: `${fieldName} must have at most ${rule.maxItems} items`,
          value,
        };
      }

      // Validate each item
      if (rule.items) {
        for (let i = 0; i < value.length; i++) {
          const itemError = validateValue(`${fieldName}[${i}]`, value[i], rule.items as ValidationField);
          if (itemError) {
            return itemError;
          }
        }
      }
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {
          field: fieldName,
          message: `${fieldName} must be an object`,
          value,
        };
      }

      // Validate object properties
      if (rule.properties) {
        for (const [propName, propRule] of Object.entries(rule.properties)) {
          const propError = validateValue(
            `${fieldName}.${propName}`,
            value[propName],
            propRule
          );
          if (propError) {
            return propError;
          }
        }
      }
      break;

    case 'uuid':
      if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        return {
          field: fieldName,
          message: `${fieldName} must be a valid UUID`,
          value,
        };
      }
      break;

    case 'email':
      if (typeof value !== 'string' || !EMAIL_PATTERN.test(value)) {
        return {
          field: fieldName,
          message: `${fieldName} must be a valid email address`,
          value,
        };
      }
      break;

    case 'url':
      if (typeof value !== 'string' || !URL_PATTERN.test(value)) {
        return {
          field: fieldName,
          message: `${fieldName} must be a valid URL`,
          value,
        };
      }
      break;
  }

  return null;
}

/**
 * Validate request against schema
 */
export function validate(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: ValidationError[] = [];

    // Validate body
    if (schema.body) {
      for (const [fieldName, fieldRule] of Object.entries(schema.body)) {
        const error = validateValue(fieldName, req.body?.[fieldName], fieldRule);
        if (error) {
          errors.push(error);
        }
      }
    }

    // Validate query parameters
    if (schema.query) {
      for (const [fieldName, fieldRule] of Object.entries(schema.query)) {
        const error = validateValue(fieldName, req.query?.[fieldName], fieldRule);
        if (error) {
          errors.push(error);
        }
      }
    }

    // Validate URL parameters
    if (schema.params) {
      for (const [fieldName, fieldRule] of Object.entries(schema.params)) {
        const error = validateValue(fieldName, req.params?.[fieldName], fieldRule);
        if (error) {
          errors.push(error);
        }
      }
    }

    // Return validation errors
    if (errors.length > 0) {
      const errorMessage = errors.map(e => e.message).join('; ');
      return next(new BadRequestError(errorMessage, { validationErrors: errors }));
    }

    next();
  };
}

/**
 * Sanitize string input to prevent injection attacks
 */
export function sanitizeString(input: string): string {
  // Remove control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');

  // Limit length
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }

  return sanitized;
}

/**
 * Sanitize all string fields in an object
 */
export function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object' && obj !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}
