import { z, ZodSchema } from 'zod';
import { Tool } from '@langchain/core/tools';

/**
 * Tool execution result
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
  costUsd?: number;
}

/**
 * Tool execution context with tracing and budget
 */
export interface ToolContext {
  workflowId: string;
  phaseId: string;
  agentId: string;
  correlationId: string;
  budgetRemaining: number;
  timeout: number; // milliseconds
}

/**
 * Tool metadata for registry
 */
export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  category: 'research' | 'analysis' | 'validation' | 'generation' | 'execution';
  costEstimate: number; // USD
  avgDurationMs: number;
  requiresApproval: boolean;
  resourceLimits?: {
    maxMemoryMb?: number;
    maxCpuPercent?: number;
    maxDurationMs?: number;
  };
}

/**
 * Base class for all IdeaMine tools
 *
 * Implements:
 * - LangChain Tool interface for agent compatibility
 * - Structured input/output with Zod validation
 * - Automatic retry logic with exponential backoff
 * - Timeout enforcement
 * - Cost tracking
 * - Comprehensive error handling
 */
export abstract class BaseTool<TInput = unknown, TOutput = unknown> extends Tool {
  protected readonly metadata: ToolMetadata;
  protected readonly inputSchema: ZodSchema<TInput>;
  protected readonly outputSchema: ZodSchema<TOutput>;
  protected readonly maxRetries: number = 3;
  protected readonly retryDelayMs: number = 1000;

  constructor(
    metadata: ToolMetadata,
    inputSchema: ZodSchema<TInput>,
    outputSchema: ZodSchema<TOutput>
  ) {
    super();
    this.metadata = metadata;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
    this.name = metadata.name;
    this.description = metadata.description;
  }

  /**
   * LangChain Tool interface implementation
   */
  async _call(input: string): Promise<string> {
    try {
      // Parse input (LangChain passes JSON string)
      const parsedInput = JSON.parse(input) as TInput;

      // Execute with context
      const result = await this.execute(parsedInput, {
        workflowId: 'default',
        phaseId: 'default',
        agentId: 'default',
        correlationId: 'default',
        budgetRemaining: 1000,
        timeout: this.metadata.resourceLimits?.maxDurationMs ?? 60000,
      });

      // Return result as JSON string
      return JSON.stringify(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: errorMessage,
        durationMs: 0,
      });
    }
  }

  /**
   * Execute tool with full context and validation
   */
  async execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedInput = this.inputSchema.parse(input);

      // Check budget
      if (this.metadata.costEstimate > context.budgetRemaining) {
        throw new Error(
          `Insufficient budget: need $${this.metadata.costEstimate}, have $${context.budgetRemaining}`
        );
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(
        () => this.executeImpl(validatedInput, context),
        context.timeout
      );

      // Validate output
      const validatedOutput = this.outputSchema.parse(result);

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        data: validatedOutput,
        durationMs,
        costUsd: this.metadata.costEstimate,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: errorMessage,
        durationMs,
      };
    }
  }

  /**
   * Execute with automatic retry logic
   */
  async executeWithRetry(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.execute(input, context);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on validation errors
        if (error instanceof z.ZodError) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Unknown error during retry');
  }

  /**
   * Execute with timeout enforcement
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      this.createTimeout<T>(timeoutMs),
    ]);
  }

  /**
   * Create timeout promise
   */
  private createTimeout<T>(ms: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool execution timeout after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get tool metadata
   */
  getMetadata(): ToolMetadata {
    return { ...this.metadata };
  }

  /**
   * Abstract method: Implement actual tool logic
   */
  protected abstract executeImpl(input: TInput, context: ToolContext): Promise<TOutput>;
}

/**
 * Tool registry for managing available tools
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  /**
   * Register a tool
   */
  register(tool: BaseTool): void {
    const metadata = tool.getMetadata();
    this.tools.set(metadata.id, tool);
  }

  /**
   * Get tool by ID
   */
  get(id: string): BaseTool | undefined {
    return this.tools.get(id);
  }

  /**
   * Get all tools
   */
  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolMetadata['category']): BaseTool[] {
    return this.getAll().filter((tool) => {
      const metadata = tool.getMetadata();
      return metadata.category === category;
    });
  }

  /**
   * Get tool metadata
   */
  getMetadata(id: string): ToolMetadata | undefined {
    const tool = this.get(id);
    return tool?.getMetadata();
  }

  /**
   * List all tool IDs
   */
  list(): string[] {
    return Array.from(this.tools.keys());
  }
}
