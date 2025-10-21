import pino from 'pino';

const logger = pino({ name: 'fallback-ladder' });

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  output?: any;
  error?: string;
}

/**
 * Tool executor interface
 */
export interface ToolExecutor {
  execute(toolId: string, input: any): Promise<ToolResult>;
}

/**
 * Tool Fallback Ladder - Try alternate tools when primary fails
 *
 * Features:
 * - Build fallback ladder from primary tool + similar tools
 * - Try each tool in sequence until one succeeds
 * - Group tools by category for intelligent fallbacks
 * - Log fallback attempts for debugging
 *
 * Spec: orchestrator.txt:139-141, phase.txt:87
 */
export class FallbackLadder {
  constructor(private toolExecutor: ToolExecutor) {}

  /**
   * Execute with fallback ladder
   *
   * Tries primary tool first, then falls back to similar tools
   *
   * @param primaryTool - Primary tool to try
   * @param allowlistedTools - Tools allowed as fallbacks
   * @param input - Tool input
   * @returns Tool result
   */
  async executeWithFallback(
    primaryTool: string,
    allowlistedTools: string[],
    input: any
  ): Promise<ToolResult> {
    // Build fallback ladder
    const ladder = this.buildLadder(primaryTool, allowlistedTools);

    logger.info(
      { primaryTool, ladder, allowlistedCount: allowlistedTools.length },
      'Executing with fallback ladder'
    );

    const errors: Array<{ toolId: string; error: string }> = [];

    for (let i = 0; i < ladder.length; i++) {
      const toolId = ladder[i];

      try {
        logger.debug({ toolId, attemptIndex: i, totalAttempts: ladder.length }, 'Trying tool');

        const result = await this.toolExecutor.execute(toolId, input);

        if (result.success) {
          logger.info(
            { toolId, attemptIndex: i, failedTools: errors.length },
            'Tool execution succeeded'
          );
          return result;
        } else {
          logger.warn({ toolId, error: result.error }, 'Tool returned failure');
          errors.push({ toolId, error: result.error || 'Unknown error' });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.warn({ toolId, error: errorMessage }, 'Tool execution threw error');

        errors.push({ toolId, error: errorMessage });
      }
    }

    // All tools in ladder failed
    logger.error(
      { primaryTool, ladder, errors },
      'All tools in fallback ladder failed'
    );

    return {
      success: false,
      error: `All tools in fallback ladder failed for ${primaryTool}. Errors: ${JSON.stringify(errors)}`,
    };
  }

  /**
   * Build fallback ladder from primary tool and allowlist
   *
   * Strategy:
   * 1. Primary tool first
   * 2. Similar tools from allowlist (same category)
   * 3. Other allowlisted tools (different category)
   *
   * @param primaryTool - Primary tool
   * @param allowlistedTools - Allowlisted tools
   * @returns Ordered ladder of tools to try
   */
  private buildLadder(primaryTool: string, allowlistedTools: string[]): string[] {
    const ladder: string[] = [];

    // 1. Primary tool first
    ladder.push(primaryTool);

    // Get category of primary tool
    const primaryCategory = this.getToolCategory(primaryTool);

    // 2. Similar tools (same category, excluding primary)
    const similarTools = allowlistedTools.filter(
      (t) => this.getToolCategory(t) === primaryCategory && t !== primaryTool
    );

    ladder.push(...similarTools);

    // 3. Other tools (different category)
    const otherTools = allowlistedTools.filter(
      (t) => this.getToolCategory(t) !== primaryCategory && !ladder.includes(t)
    );

    ladder.push(...otherTools);

    logger.debug(
      {
        primaryTool,
        primaryCategory,
        similarCount: similarTools.length,
        otherCount: otherTools.length,
        totalLadder: ladder.length,
      },
      'Built fallback ladder'
    );

    return ladder;
  }

  /**
   * Get tool category from tool ID
   *
   * Example: "tool.intake.normalizer" → "intake"
   *
   * @param toolId - Tool ID
   * @returns Tool category
   */
  private getToolCategory(toolId: string): string {
    const parts = toolId.split('.');

    if (parts.length >= 2 && parts[0] === 'tool') {
      return parts[1];
    }

    return 'unknown';
  }

  /**
   * Execute with custom ladder (for testing or advanced use)
   *
   * @param ladder - Custom ladder of tool IDs
   * @param input - Tool input
   * @returns Tool result
   */
  async executeWithCustomLadder(ladder: string[], input: any): Promise<ToolResult> {
    logger.info({ ladder, ladderLength: ladder.length }, 'Executing with custom ladder');

    for (let i = 0; i < ladder.length; i++) {
      const toolId = ladder[i];

      try {
        const result = await this.toolExecutor.execute(toolId, input);

        if (result.success) {
          logger.info({ toolId, attemptIndex: i }, 'Tool succeeded in custom ladder');
          return result;
        }
      } catch (error) {
        logger.warn({ toolId, error }, 'Tool failed in custom ladder');
      }
    }

    return {
      success: false,
      error: 'All tools in custom ladder failed',
    };
  }
}
