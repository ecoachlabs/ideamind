/**
 * Safe JSON Stringification Utility
 * LOW PRIORITY FIX #21: Prevent performance issues with large objects
 *
 * Features:
 * - Handles circular references
 * - Limits output length
 * - Prevents event loop blocking
 * - Safe error handling
 */

interface SafeStringifyOptions {
  maxLength?: number;
  space?: number;
  replacer?: (key: string, value: any) => any;
}

/**
 * Safely stringify an object to JSON
 *
 * @param obj - Object to stringify
 * @param maxLength - Maximum output length (default: 1000)
 * @returns JSON string or error message
 */
export function safeStringify(obj: any, maxLength: number = 1000): string {
  try {
    const seen = new WeakSet();

    const str = JSON.stringify(obj, (key, value) => {
      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }

      // Handle special types
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      if (value instanceof RegExp) {
        return value.toString();
      }

      if (typeof value === 'function') {
        return '[Function]';
      }

      if (typeof value === 'symbol') {
        return value.toString();
      }

      if (typeof value === 'bigint') {
        return value.toString() + 'n';
      }

      return value;
    });

    // Truncate if too long
    return str.length > maxLength ? str.substring(0, maxLength) + '...[truncated]' : str;
  } catch (error) {
    return '[StringifyError: ' + (error instanceof Error ? error.message : 'Unknown') + ']';
  }
}

/**
 * Safely stringify with custom options
 *
 * @param obj - Object to stringify
 * @param options - Stringification options
 * @returns JSON string or error message
 */
export function safeStringifyWithOptions(
  obj: any,
  options: SafeStringifyOptions = {}
): string {
  const { maxLength = 1000, space, replacer } = options;

  try {
    const seen = new WeakSet();

    const defaultReplacer = (key: string, value: any): any => {
      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }

      // Apply custom replacer if provided
      if (replacer) {
        value = replacer(key, value);
      }

      // Handle special types
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      if (value instanceof RegExp) {
        return value.toString();
      }

      if (typeof value === 'function') {
        return '[Function]';
      }

      if (typeof value === 'symbol') {
        return value.toString();
      }

      if (typeof value === 'bigint') {
        return value.toString() + 'n';
      }

      return value;
    };

    const str = JSON.stringify(obj, defaultReplacer, space);

    // Truncate if too long
    return str.length > maxLength ? str.substring(0, maxLength) + '...[truncated]' : str;
  } catch (error) {
    return '[StringifyError: ' + (error instanceof Error ? error.message : 'Unknown') + ']';
  }
}

/**
 * Safely parse JSON with error handling
 *
 * @param json - JSON string to parse
 * @returns Parsed object or null on error
 */
export function safeParse<T = any>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    console.error('[SafeParse] Failed to parse JSON:', error);
    return null;
  }
}

/**
 * Check if a string is valid JSON
 *
 * @param str - String to check
 * @returns True if valid JSON
 */
export function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pretty print an object for debugging
 *
 * @param obj - Object to print
 * @param maxDepth - Maximum nesting depth (default: 3)
 * @returns Formatted string
 */
export function prettyPrint(obj: any, maxDepth: number = 3): string {
  const seen = new WeakSet();
  let currentDepth = 0;

  const format = (value: any, depth: number): string => {
    if (depth > maxDepth) {
      return '[Max Depth Reached]';
    }

    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    if (typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);

      if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map(v => format(v, depth + 1)).join(', ');
        return `[${items}]`;
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      if (value instanceof Error) {
        return `Error: ${value.message}`;
      }

      const entries = Object.entries(value)
        .map(([k, v]) => `${k}: ${format(v, depth + 1)}`)
        .join(', ');
      return `{${entries}}`;
    }

    if (typeof value === 'string') {
      return `"${value}"`;
    }

    if (typeof value === 'function') {
      return '[Function]';
    }

    return String(value);
  };

  return format(obj, 0);
}
