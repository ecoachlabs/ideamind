import pino from 'pino';
import Anthropic from '@anthropic-ai/sdk';

const logger = pino({ name: 'base-agent' });

/**
 * Agent capabilities
 */
export interface AgentCapabilities {
  supportsStreaming: boolean;
  supportsBatching: boolean;
  supportsCheckpointing: boolean;
  maxInputSize: number;
  maxOutputSize: number;
}

/**
 * Agent execution result
 */
export interface AgentResult {
  success: boolean;
  output: any;
  metadata?: {
    tokensUsed?: number;
    duration_ms?: number;
    model?: string;
    [key: string]: any;
  };
  error?: string;
}

/**
 * Base Agent
 *
 * Abstract base class for all agents in the system
 */
export abstract class BaseAgent {
  protected anthropic: Anthropic;
  protected logger: pino.Logger;

  constructor(
    protected name: string,
    protected apiKey: string,
    protected model: string = 'claude-3-5-sonnet-20241022'
  ) {
    this.anthropic = new Anthropic({ apiKey });
    this.logger = logger.child({ agent: name });
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get agent capabilities
   */
  abstract getCapabilities(): AgentCapabilities;

  /**
   * Execute agent
   *
   * @param input - Input data
   * @param context - Execution context
   * @returns Agent result
   */
  abstract execute(
    input: any,
    context: Record<string, any>
  ): Promise<AgentResult>;

  /**
   * Validate input
   *
   * @param input - Input to validate
   * @returns True if valid
   */
  protected validateInput(input: any): boolean {
    if (!input) {
      this.logger.warn('No input provided');
      return false;
    }

    const capabilities = this.getCapabilities();
    const inputSize = JSON.stringify(input).length;

    if (inputSize > capabilities.maxInputSize) {
      this.logger.warn(
        {
          inputSize,
          maxSize: capabilities.maxInputSize,
        },
        'Input exceeds maximum size'
      );
      return false;
    }

    return true;
  }

  /**
   * Call Claude API
   */
  protected async callClaude(
    prompt: string,
    maxTokens: number = 4000,
    systemPrompt?: string
  ): Promise<{ text: string; tokensUsed: number }> {
    const startTime = Date.now();

    try {
      const messages: Anthropic.MessageParam[] = [
        {
          role: 'user',
          content: prompt,
        },
      ];

      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      });

      const duration = Date.now() - startTime;

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response from Claude');
      }

      const tokensUsed =
        (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0);

      this.logger.debug(
        {
          tokensUsed,
          duration_ms: duration,
        },
        'Claude API call complete'
      );

      return {
        text: content.text,
        tokensUsed,
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Claude API call failed');
      throw error;
    }
  }

  /**
   * Parse JSON from response
   */
  protected parseJSON(text: string): any {
    // Extract JSON from markdown code blocks
    let jsonText = text.trim();

    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      this.logger.error({ error, text: jsonText }, 'Failed to parse JSON');
      throw new Error('Failed to parse JSON response');
    }
  }

  /**
   * Create checkpoint
   */
  async checkpoint(state: any): Promise<string> {
    const checkpointId = `ckpt-${this.name}-${Date.now()}`;

    this.logger.debug({ checkpointId }, 'Creating checkpoint');

    // In production, would save to database
    // For now, just return the ID

    return checkpointId;
  }

  /**
   * Restore from checkpoint
   */
  async restore(checkpointId: string): Promise<any> {
    this.logger.debug({ checkpointId }, 'Restoring from checkpoint');

    // In production, would load from database
    return null;
  }
}
