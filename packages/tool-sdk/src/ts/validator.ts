/**
 * IdeaMine Tools SDK - Schema Validator
 * JSON Schema validation using AJV
 */

import Ajv, { JSONSchemaType, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { ValidationError } from './types';
import { Logger } from './types';

export class SchemaValidator {
  private ajv: Ajv;
  private logger: Logger;
  private validators: Map<string, ValidateFunction<any>>;

  constructor(logger: Logger) {
    this.logger = logger;
    this.validators = new Map();

    // Initialize AJV with strict mode and formats
    this.ajv = new Ajv({
      strict: true,
      allErrors: true,
      verbose: true,
      coerceTypes: false,
      useDefaults: true,
    });

    // Add common formats (date-time, email, uri, etc.)
    addFormats(this.ajv);

    // Add custom formats if needed
    this.ajv.addFormat('semver', {
      validate: (version: string) => {
        return /^\d+\.\d+\.\d+(-[a-zA-Z0-9\.-]+)?$/.test(version);
      },
    });
  }

  /**
   * Compile and cache schema validator
   */
  private getValidator(schema: JSONSchemaType<any>, key: string): ValidateFunction<any> {
    if (!this.validators.has(key)) {
      try {
        const validator = this.ajv.compile(schema);
        this.validators.set(key, validator);
        this.logger.debug('Schema compiled and cached', { key });
      } catch (error) {
        this.logger.error('Failed to compile schema', { key, error });
        throw new ValidationError('Invalid schema definition', {
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.validators.get(key)!;
  }

  /**
   * Validate input against schema
   */
  validateInput<T>(
    input: unknown,
    schema: JSONSchemaType<T>,
    toolName: string
  ): T {
    const key = `${toolName}:input`;
    const validator = this.getValidator(schema, key);

    if (!validator(input)) {
      const errors = this.formatErrors(validator.errors || []);
      this.logger.warn('Input validation failed', {
        tool: toolName,
        errors,
      });

      throw new ValidationError('Input validation failed', {
        tool: toolName,
        errors,
      });
    }

    this.logger.debug('Input validation succeeded', { tool: toolName });
    return input as T;
  }

  /**
   * Validate output against schema
   */
  validateOutput<T>(
    output: unknown,
    schema: JSONSchemaType<T>,
    toolName: string
  ): T {
    const key = `${toolName}:output`;
    const validator = this.getValidator(schema, key);

    if (!validator(output)) {
      const errors = this.formatErrors(validator.errors || []);
      this.logger.error('Output validation failed', {
        tool: toolName,
        errors,
      });

      throw new ValidationError('Output validation failed', {
        tool: toolName,
        errors,
      });
    }

    this.logger.debug('Output validation succeeded', { tool: toolName });
    return output as T;
  }

  /**
   * Validate tool configuration
   */
  validateToolConfig(config: any): void {
    const requiredFields = [
      'name',
      'version',
      'summary',
      'owner',
      'capabilities',
      'input_schema',
      'output_schema',
      'runtime',
      'image',
    ];

    const missing = requiredFields.filter(field => !(field in config));

    if (missing.length > 0) {
      throw new ValidationError('Missing required configuration fields', {
        missing,
      });
    }

    // Validate name format
    if (!/^[a-z][a-z0-9\._-]+$/.test(config.name)) {
      throw new ValidationError('Invalid tool name format', {
        name: config.name,
        expected: 'lowercase letters, numbers, dots, underscores, and hyphens',
      });
    }

    // Validate version format (SemVer)
    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9\.-]+)?$/.test(config.version)) {
      throw new ValidationError('Invalid version format', {
        version: config.version,
        expected: 'SemVer (e.g., 1.2.3 or 1.2.3-beta.1)',
      });
    }

    // Validate runtime
    if (!['docker', 'wasm'].includes(config.runtime)) {
      throw new ValidationError('Invalid runtime', {
        runtime: config.runtime,
        allowed: ['docker', 'wasm'],
      });
    }

    // Validate capabilities
    if (!Array.isArray(config.capabilities) || config.capabilities.length === 0) {
      throw new ValidationError('Capabilities must be a non-empty array');
    }

    // Validate timeout
    if (config.timeout_ms && (config.timeout_ms < 1000 || config.timeout_ms > 600000)) {
      throw new ValidationError('Timeout must be between 1000ms and 600000ms', {
        timeout_ms: config.timeout_ms,
      });
    }

    this.logger.debug('Tool config validation succeeded', {
      name: config.name,
      version: config.version,
    });
  }

  /**
   * Format AJV errors for better readability
   */
  private formatErrors(errors: any[]): any[] {
    return errors.map(err => ({
      path: err.instancePath || '/',
      message: err.message,
      keyword: err.keyword,
      params: err.params,
      ...(err.data !== undefined && { received: err.data }),
    }));
  }

  /**
   * Clear validator cache
   */
  clearCache(): void {
    this.validators.clear();
    this.logger.debug('Validator cache cleared');
  }
}
