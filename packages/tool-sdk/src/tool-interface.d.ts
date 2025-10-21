import { ZodSchema } from 'zod';
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
export declare abstract class BaseTool implements ToolInterface {
    abstract execute(input: Record<string, unknown>): Promise<ToolExecutionResult>;
    /**
     * Validate input against schema
     */
    protected validateInput<T>(input: Record<string, unknown>, schema: ZodSchema<T>): T;
    /**
     * Log to stderr
     */
    protected log(message: string): void;
}
/**
 * CLI wrapper for running tools
 *
 * Usage: node tool.js < input.json > output.json
 */
export declare function runToolCLI(tool: ToolInterface): Promise<void>;
//# sourceMappingURL=tool-interface.d.ts.map