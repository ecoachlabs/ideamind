import { z, ZodSchema, ZodError } from 'zod';

/**
 * Tool interface that all tools must implement
 *
 * Tools can be implemented in any language, but must:
 * 1. Accept input via stdin as JSON
 * 2. Write output to stdout as JSON
 * 3. Write logs to stderr
 * 4. Exit with code 0 on success, non-zero on failure
 */
export interface ToolInterface {
  /**
   * Execute the tool with given input
   */
  execute(input: Record<string, unknown>): Promise<ToolExecutionResult>;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  output: Record<string, unknown>;
  error?: string;
}

/**
 * Base class for TypeScript tools
 */
export abstract class BaseTool implements ToolInterface {
  abstract execute(input: Record<string, unknown>): Promise<ToolExecutionResult>;

  /**
   * Validate input against schema
   */
  protected validateInput<T>(input: Record<string, unknown>, schema: ZodSchema<T>): T {
    try {
      return schema.parse(input);
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        throw new Error(`Input validation failed: ${formattedErrors}`);
      }
      throw error;
    }
  }

  /**
   * Log to stderr
   */
  protected log(message: string): void {
    console.error(`[Tool] ${message}`);
  }
}

/**
 * CLI wrapper for running tools
 *
 * Usage: node tool.js < input.json > output.json
 */
export async function runToolCLI(tool: ToolInterface): Promise<void> {
  try {
    // Read input from stdin
    const inputChunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      inputChunks.push(chunk);
    }
    const inputStr = Buffer.concat(inputChunks).toString('utf-8');
    const input = JSON.parse(inputStr) as Record<string, unknown>;

    // Execute tool
    const result = await tool.execute(input);

    // Write output to stdout
    console.log(JSON.stringify(result.output, null, 2));

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Tool execution failed:', error);
    console.log(JSON.stringify({ error: String(error) }, null, 2));
    process.exit(1);
  }
}
